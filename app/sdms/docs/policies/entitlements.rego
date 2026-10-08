package entitlements

import input

headers = {
	"Content-Type": "application/json",
	"data-partition-id": input.datapartitionId,
	"Authorization": sprintf("Bearer %v", [input.token]),
	"Accept": "application/json",
}

groups := http.send({
	"method": "GET",
	"url": "DES_POLICY_SERVICE_HOST/api/entitlements/v2/groups",   # pragma: allowlist secret
	"headers": headers,
	"force_cache": true,
	"force_cache_duration_seconds": 10,
})

pragma: allowlist secret