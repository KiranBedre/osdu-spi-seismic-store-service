using Newtonsoft.Json;

public class QueryPaginatedRequestBody
{

    public string? cs { get; set; }
    public string? sql { get; set; }
    public string? ctoken { get; set; }
    public int? limit { get; set; }

}

public class PaginatedRecords
{

    public List<Object>? records { get; set; }

    public string? continuationToken { get; set; }

}

public class PaginatedRecordsPath
{

    public List<RecordPath>? records { get; set; }

    public string? continuationToken { get; set; }

}


public class RecordPath
{
    [JsonProperty(PropertyName = "path")]
    public string? Path { get; set; }
}

public class Record
{
    [JsonProperty(PropertyName = "id")]
    public string? Id { get; set; }

    [JsonProperty(PropertyName = "data")]
    public Data? Data { get; set; }

    public override string ToString()
    {
        return JsonConvert.SerializeObject(this);
    }

    public static Record? FromString(string json)
    {
        return JsonConvert.DeserializeObject<Record>(json);
    }
}

public class Data
{
    [JsonProperty(PropertyName = "name")]
    public string? name { get; set; }

    [JsonProperty(PropertyName = "tenant")]
    public string? tenant { get; set; }

    [JsonProperty(PropertyName = "subproject")]
    public string? subproject { get; set; }

    [JsonProperty(PropertyName = "path")]
    public string? path { get; set; }

    [JsonProperty(PropertyName = "ltag")]
    public string? ltag { get; set; }

    [JsonProperty(PropertyName = "created_by")]
    public string? created_by { get; set; }

    [JsonProperty(PropertyName = "last_modified_date")]
    public string? last_modified_date { get; set; }

    [JsonProperty(PropertyName = "created_date")]
    public string? created_date { get; set; }

    [JsonProperty(PropertyName = "gcsurl")]
    public string? gcsurl { get; set; }

    [JsonProperty(PropertyName = "ctag")]
    public string? ctag { get; set; }

    [JsonProperty(PropertyName = "metadata")]
    public object? metadata { get; set; }

    [JsonProperty(PropertyName = "filemetadata")]
    public FileMetadata? filemetadata { get; set; }

    [JsonProperty(PropertyName = "type")]
    public string? type { get; set; }

    [JsonProperty(PropertyName = "sbit")]
    public string? sbit { get; set; }

    [JsonProperty(PropertyName = "sbit_count")]
    public int? sbit_count { get; set; }

    [JsonProperty(PropertyName = "gtags")]
    public string[]? gtags { get; set; }

    [JsonProperty(PropertyName = "readonly")]
    public bool? ReadOnly { get; set; }

    [JsonProperty(PropertyName = "seismicmeta_guid")]
    public string? seismicmeta_guid { get; set; }

    [JsonProperty(PropertyName = "transfer_status")]
    public string? transfer_status { get; set; }

    [JsonProperty(PropertyName = "access_policy")]
    public string? access_policy { get; set; }

    [JsonProperty(PropertyName = "storageSchemaRecordType")]
    public string? StorageSchemaRecordType { get; set; }

    [JsonProperty(PropertyName = "storageSchemaRecord")]
    public object? StorageSchemaRecord { get; set; }

    [JsonProperty(PropertyName = "acls")]
    public DatasetAcl? acls { get; set; }

    [JsonProperty(PropertyName = "Symbol(id)")]
    public SymbolId? SymbolId { get; set; }

}

public class FileMetadata
{
    [JsonProperty(PropertyName = "nobjects")]
    public long? nobjects { get; set; }

    [JsonProperty(PropertyName = "size")]
    public long? size { get; set; }

    [JsonProperty(PropertyName = "type")]
    public string? type { get; set; }

}


public class DatasetAcl
{
    [JsonProperty(PropertyName = "admins")]
    public List<string>? Admins { get; set; }

    [JsonProperty(PropertyName = "viewers")]
    public List<string>? Viewers { get; set; }
}

public class SymbolId
{
    [JsonProperty(PropertyName = "partitionKey")]
    public string? PartitionKey { get; set; }

    [JsonProperty(PropertyName = "name")]
    public string? Name { get; set; }
}
