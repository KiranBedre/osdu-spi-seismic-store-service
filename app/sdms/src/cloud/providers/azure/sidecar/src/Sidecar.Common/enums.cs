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

namespace Sidecar.Common
{
    using System.ComponentModel;

    public static class EnumExtensionMethods
    {
        public static string Description(this Enum enumVal)
        {
            var field = enumVal.GetType().GetField(enumVal.ToString());
            if (field == null) return enumVal.ToString();
            if (Attribute.GetCustomAttribute(field, typeof(DescriptionAttribute)) is DescriptionAttribute attribute)
            {
                return attribute.Description;
            }
            return enumVal.ToString();
        }

    }

    public enum Status
    {
        [Description("Started")]
        Started = 0,
        [Description("In Progress")]
        InProgress = 1,
        [Description("Completed")]
        Completed = 2,
        [Description("Completed With Errors")]
        CompletedWithErrors = 3
    }
}
