using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Cosmos;
using Sidecar.Services;

namespace Sidecar.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class CosmosController : ControllerBase
    {
        private readonly IDataAccess _dataAccess;

        public CosmosController(IDataAccess dataAccess)
        {
            _dataAccess = dataAccess;
        }

        [HttpPost("/insert")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        public async Task<IActionResult> Insert(string cs, string item)
        {
            try
            {
                await _dataAccess.Insert(cs, Record.FromString(item));
                return Ok();
            }
            catch (CosmosException ex)
            {
                return Problem(((int)ex.StatusCode) + "-" + ex.ResponseBody);
            }
        }

        [HttpGet("/get")]
        [ProducesResponseType(StatusCodes.Status200OK, Type = typeof(Record))]
        public async Task<IActionResult> Get(string cs, string pk)
        {
            try
            {
                return Ok(await _dataAccess.Get(cs, pk));
            }
            catch (CosmosException ex)
            {
                return Problem(((int)ex.StatusCode) + "-" + ex.ResponseBody);
            }
        }

        [HttpDelete("/delete")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        public async Task<IActionResult> Delete(string cs, string pk)
        {
            try
            {
                await _dataAccess.Delete(cs, pk);
                return Ok();
            }
            catch (CosmosException ex)
            {
                return Problem(((int)ex.StatusCode) + "-" + ex.ResponseBody);
            }
        }

        [HttpPost("/query")]
        [ProducesResponseType(StatusCodes.Status200OK, Type = typeof(PaginatedRecords))]
        public async Task<IActionResult> Query([FromBody] QueryPaginatedRequestBody body)
        {
            try
            {
                if(body.cs != null && body.sql != null) {
                    return Ok(await _dataAccess.Query(body.cs, body.sql, body.ctoken, body.limit));
                } else if(body.cs == null) {
                    return Problem(400 + "- cs query argument is required");                    
                } else {
                    return Problem(400 + "- sql query argument is required");
                }
            }
            catch (CosmosException ex)
            {
                return Problem(((int)ex.StatusCode) + "-" + ex.ResponseBody);
            }

        }

        [HttpPost("/query-path")]
        [ProducesResponseType(StatusCodes.Status200OK, Type = typeof(PaginatedRecordsPath))]
        public async Task<IActionResult> QueryPath([FromBody] QueryPaginatedRequestBody body)
        {
            try
            {
                if(body.cs != null && body.sql != null) {
                    return Ok(await _dataAccess.QueryPath(body.cs, body.sql, body.ctoken, body.limit));
                } else if(body.cs == null) {
                    return Problem(400 + "- cs query argument is required");                    
                } else {
                    return Problem(400 + "- sql query argument is required");
                }

            }
            catch (CosmosException ex)
            {
                return Problem(((int)ex.StatusCode) + "-" + ex.ResponseBody);
            }
        }

    }
}
