from fastapi import Request

class Log:
  def __init__(self, request: Request, response, time):
    scope = request.scope
    query = request.query_params
    present = Log.isPresent(query.get('sdpath'))
    self.tenant = query.get("sdpath")[len('sd://'):].split('/')[0] if present else None
    self.name = scope['method'] + ' ' + scope['path']
    self.operation_Name = self.name
    self.url = str(request.url)
    self.success = response.status_code == 200
    self.response_code = response.status_code
    self.duration = time * 1000
  
  def isPresent(sdpath: str):
        if not sdpath.startswith('sd://'):
            return False
        return True