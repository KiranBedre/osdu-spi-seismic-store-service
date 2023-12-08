namespace Sidecar.ComputeSizeOperationRunner.Tests.Service;

using Sidecar.ComputeSizeRunner;
using Xunit;

public class DateFormatterTests
{
    [Fact]
    public void ConvertDateTime()
    {
        var dateFormatter = new DateFormatter();
        Assert.Equal("Tue, 31 Oct 2023 12:12:51 GMT", dateFormatter.FormatDate(new DateTime(2023, 10, 31, 12, 12, 51, DateTimeKind.Utc)));
    }
}
