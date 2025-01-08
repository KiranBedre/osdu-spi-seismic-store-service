from azure.identity import DefaultAzureCredential
from azure.keyvault.secrets import SecretClient
from core.config import settings

class KeyVault():

    @staticmethod
    def getInsightsConnectionString():
        vaultName: str = settings.KEYVAULT_URL
        try:
            credential = DefaultAzureCredential()
            URL: str = vaultName if vaultName.startswith('https') else f'https://{vaultName}.vault.azure.net/'

            secret_client = SecretClient(vault_url=URL, credential=credential)
            secret = secret_client.get_secret('appinsights-connection-string')

            return str(secret.value)
        except Exception as ex:
            print(ex)