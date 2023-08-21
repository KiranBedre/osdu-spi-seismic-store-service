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

using CommandLine;

# pragma warning disable CS8618 // Non-nullable field is uninitialized. Consider declaring as nullable.
namespace Sidecar.Common.Model
{
    public class QueueOptionsRedis : IQueueOptionsRedis
    {
        [Option('c', "conn", Required = true, HelpText = "Connection String.")]
        public string ConnectionString {get; set;}

        [Option('q', "queue", Required = true, HelpText = "Queue name.")]
        public string QueueName { get; set; }
    }

}
