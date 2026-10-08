import os
import requests
import json

url = os.getenv('KEYCLOAK_URL')
client_id = os.getenv('KEYCLOAK_CLIENT_ID')
client_secret = os.getenv('KEYCLOAK_CLIENT_SECRET')
user = os.getenv('IBM_SEISMIC_AUTH_USER_ACCESS')
password = os.getenv('IBM_SEISMIC_AUTH_USER_ACCESS_PASSWORD')

payload = "grant_type=password&client_id="+client_id+"&client_secret="+client_secret+"&username="+user+"&password="+password+"&scope=openid"
headers = {
            'Content-Type': "application/x-www-form-urlencoded"
                }
full_url="https://"+url+"/auth/realms/OSDU/protocol/openid-connect/token"
response = requests.request("POST", full_url, data=payload, headers=headers)

result = response.json()
token = result['access_token']
print(token)
