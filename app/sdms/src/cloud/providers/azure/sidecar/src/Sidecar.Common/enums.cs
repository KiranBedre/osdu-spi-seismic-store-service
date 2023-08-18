
using System.ComponentModel;
using System.Reflection;

namespace Sidecar.Common;

public static class EnumExtensionMethods
{
    public static string Description(this Enum enumVal)
    {
        var field = enumVal.GetType().GetField(enumVal.ToString());
        if (field != null)
        {
            if (Attribute.GetCustomAttribute(field, typeof(DescriptionAttribute)) is DescriptionAttribute attribute)
            {
                return attribute.Description;
            }
        }
        return enumVal.ToString();
    }

}

public enum DeletionOperationStatus
{
    [Description("Started")]
    Started = 0,
    [Description("In Progress")]
    Inprogress = 1,
    [Description("Completed")]
    Completed = 2,
    [Description("Completed With Errors")]
    CompletedWithErrors = 3
}