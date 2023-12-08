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

namespace Sidecar.Common.Utility;

public class Utils
{
    private static readonly Random _random = Random.Shared;  // thread-safe random just in case

    private static string MakeId(int length)
    {
        const string CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        return new(Enumerable.Repeat(CHARS, length)
            .Select(s => s[_random.Next(s.Length)]).ToArray());
    }

    public static string RandomMutex() => MakeId(10);
    public static string GenerateDeleteLockId() => Constants.DELETE_LOCK_PREFIX + MakeId(9);

    public static string GenerateWriteLockId() => Constants.WRITE_LOCK_PREFIX + MakeId(15);

    public static (string containerName, string? virtualFolderName) ParseContainerAndFolderPath(string gcsurl)
    {
        var parts = gcsurl.Split('/', 2);

        return parts.Length switch
        {
            1 => (parts[0], null),
            2 => (parts[0], parts[1]),
            _ => throw new ArgumentException(
                $"Invalid item: {gcsurl} Could not extract gcsurl in the format <container>/<folder name> ")
        };
    }

    public static (string containerName, string? virtualFolderName) ParseContainerAndFolderName(string gcsurl)
    {
        var parts = gcsurl.Split('/');

        return parts.Length switch
        {
            1 => (parts[0], null),
            2 => (parts[0], parts[1]),
            _ => throw new ArgumentException(
                $"Invalid item: {gcsurl} Could not extract gcsurl in the format <container>/<folder name> ")
        };
    }
}
