// ============================================================================
// Copyright 2017-2023, Microsoft
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ============================================================================

namespace Sidecar.Common.Service;

using Azure;
using Azure.Storage.Queues;
using Azure.Storage.Queues.Models;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Sidecar.Common.Interface;
using Sidecar.Common.Model;

public class StorageQueueDeletionTaskStorage: IDeletionTasksStorage
{
    private readonly ILogger<StorageQueueDeletionTaskStorage> _logger;
    private readonly QueueClient _queueClient;
    private readonly int _maxRetries;
    private readonly Dictionary<string, HeldMessage> _messageCache = new();

    public StorageQueueDeletionTaskStorage(
        ILogger<StorageQueueDeletionTaskStorage> logger,
        QueueClient queueClient,
        int maxRetries = 5)
    {
        _logger = logger;
        _queueClient = queueClient;
        _maxRetries = maxRetries;
    }

    public async Task<IDeleteOperationStatus?> CheckForDeletionOperationAsync(CancellationToken ct = default)
    {
        await _queueClient.CreateIfNotExistsAsync(cancellationToken: ct);
        while (true)
        {
            _logger.LogInformation("Receiving message...");
            var response = await _queueClient.ReceiveMessageAsync(
                visibilityTimeout: TimeSpan.FromMinutes(5),
                cancellationToken: ct);
        
            if (!response.HasValue)
            {
                return null;
            }

            var message = response.Value!;

            _logger.LogInformation("Received message {}", message.MessageId);
            if (message.DequeueCount > _maxRetries)
            {
                _logger.LogInformation("Deleting message {}, dequeue count too high...", message.MessageId);
                await _queueClient.DeleteMessageAsync(
                    messageId: message.MessageId,
                    popReceipt: message.PopReceipt,
                    cancellationToken: ct);
                continue;
            }

            var result = JsonConvert.DeserializeObject<DeleteOperationStatus>(message.MessageText);

            CancellationTokenSource lockRenewerCtSource = new();
            CancellationTokenSource lockIsLost = new();  // TODO: react to losing the lock

            var lockRenewer = Task.Run(() => KeepMessageLock(
                    msg: message,
                    lockIsLostCallback: lockIsLost.Cancel, 
                    ct: lockRenewerCtSource.Token),
                lockRenewerCtSource.Token);

            _messageCache[result.OperationId] = new(message, lockRenewerCtSource, lockRenewer);

            return result;
        }
    }

    public async Task DeleteDeletionOperationAsync(string operationId, CancellationToken ct)
    {
        var heldMessage = _messageCache[operationId];
        
        heldMessage.LockRenewerCtSource.Cancel();  // stop renewing the locks
        
        await _queueClient.DeleteMessageAsync(
            messageId: heldMessage.Message.MessageId,
            popReceipt: heldMessage.Message.PopReceipt,
            cancellationToken: ct);

        await heldMessage.LockRenewer;  // make sure the lock renewal thread finished
        
        _messageCache.Remove(operationId);
    }

    private async Task KeepMessageLock(QueueMessage msg, Action lockIsLostCallback, CancellationToken ct)
    {
        try
        {
            while (!ct.IsCancellationRequested)
            {
                Response<UpdateReceipt>? response;
                try
                {
                    response = await _queueClient.UpdateMessageAsync(
                        messageId: msg.MessageId,
                        popReceipt: msg.PopReceipt,
                        visibilityTimeout: TimeSpan.FromMinutes(5),
                        cancellationToken: ct);
                }
                catch (Exception e) when (e is not OperationCanceledException)
                {
                    lockIsLostCallback();
                    throw;
                }

                if (!response.HasValue)
                {
                    lockIsLostCallback();
                    return;
                }

                await Task.Delay(TimeSpan.FromMinutes(1), ct);
            }
        }
        catch (OperationCanceledException)
        {
            // do nothing
        }
    }

    private class HeldMessage
    {
        public HeldMessage(QueueMessage message, CancellationTokenSource lockRenewerCtSource, Task lockRenewer)
        {
            Message = message;
            LockRenewerCtSource = lockRenewerCtSource;
            LockRenewer = lockRenewer;
        }

        public QueueMessage Message { get; }
        public CancellationTokenSource LockRenewerCtSource { get; }
        public Task LockRenewer { get; }
    }
}
