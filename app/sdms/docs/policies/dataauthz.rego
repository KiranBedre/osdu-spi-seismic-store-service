package dataauthz

import data.entitlements

entitlementsApiResponse := entitlements.groups

userGroups := {e | e := entitlementsApiResponse.body.groups[_].email}

records[response] {
	inputAclGroups := {aclGroup | aclGroup := input.aclGroups[_]}
	response := {
		"userExistsInAtleastOneGroup": count(userGroups & inputAclGroups) != 0,
		"error": check_error,
	}
}

check_error[reason] {
	entitlementsApiResponse.status_code != 200
	reason := sprintf("Entitlements response %v %v", [entitlementsApiResponse.status_code, entitlementsApiResponse.raw_body])
}
