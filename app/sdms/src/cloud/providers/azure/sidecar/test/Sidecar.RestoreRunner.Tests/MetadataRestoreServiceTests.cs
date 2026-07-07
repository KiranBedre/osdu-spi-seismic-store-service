// ============================================================================
// Copyright 2026, Microsoft
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

namespace Sidecar.RestoreRunner.Tests;

/// <summary>
/// <see cref="MetadataRestoreService"/> is currently an intentional stub: the archival/snapshot
/// backend has not been decided. Until it is implemented, finalization MUST fail loudly (rather
/// than silently succeed) so a restore is never reported complete without metadata being restored.
/// </summary>
public class MetadataRestoreServiceTests
{
    private readonly MetadataRestoreService _service =
        new(new Mock<ILogger<MetadataRestoreService>>().Object);

    [Fact]
    public async Task FinalizeRestoreAsync_IsNotYetImplemented_Throws()
    {
        var act = () => _service.FinalizeRestoreAsync(
            "sd://opendes/subproj1/pathA/datasetX",
            "2026-06-01T00:00:00Z",
            "op-12345",
            CancellationToken.None);

        await act.Should().ThrowAsync<NotImplementedException>();
    }

    [Fact]
    public void Constructor_NullLogger_Throws()
    {
        var act = () => new MetadataRestoreService(null!);

        act.Should().Throw<ArgumentNullException>();
    }
}
