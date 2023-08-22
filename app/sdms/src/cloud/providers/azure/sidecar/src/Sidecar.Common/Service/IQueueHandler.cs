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

namespace Sidecar.Common.Service
{
    using Model;

    public interface IQueueHandler<TOptions> where TOptions : class
    {
        void Enqueue<TMessage>(string key,TMessage  value) where TMessage : class, IQueueMessage;
        TMessage Dequeue<TMessage>(string key) where TMessage : class, IQueueMessage;

        long HashIncrement(string key, string hashField, int? incBy = 1);

        Task<long> HashIncrementAsync(string key, string hashField, int? incBy = 1);

        long HashDecrement(string key, string hashField, int? decBy = 1);
        Task<long> HashDecrementAsync(string key, string hashField, int? incBy = 1);

        bool HashSet(string key, string hashField, string value);

        Task<bool> HashSetAsync(string key, string hashField, string value);
    }

}