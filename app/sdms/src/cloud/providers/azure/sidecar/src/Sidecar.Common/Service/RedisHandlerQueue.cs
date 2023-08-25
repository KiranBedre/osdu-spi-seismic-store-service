using Microsoft.Extensions.Logging;
using Sidecar.Common.Interface;
using StackExchange.Redis;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Sidecar.Common.Service
{
    public class RedisHandlerQueue<TOptions> : RedisHandler
        where TOptions : IOptionsQueueRedis
    {
        new readonly IOptionsQueueRedis Options;
        public RedisHandlerQueue(ILogger<RedisHandler> logger, IOptionsQueueRedis options, IConnectionMultiplexer connectionMultiplexer) : base (logger, options, connectionMultiplexer)
        {
            Options = options;
        }

        protected override void ValidateOptions()
        {
            base.ValidateOptions();

            ArgumentNullException.ThrowIfNull(Options, nameof(Options));
            var exceptions = new List<Exception>();

            if (string.IsNullOrEmpty(Options.QueueName))
            {
                exceptions.Add(new ArgumentException("Queue Name is required."));
            }

        }
    }
}
