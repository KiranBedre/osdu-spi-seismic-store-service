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

namespace Sidecar.Common.Interface;

public interface IComputeSizeOperationMessage : IQueueMessage
{
    string OperationId { get; set; }
    string DatasetId { get; set; }
    string Tenant { get; set; }
    string Subproject { get; set; }
    string Path { get; set; }
    string Name { get; set; }
    string BlobsPath { get; set; }
    long DatasetSize { get; set; }
}
