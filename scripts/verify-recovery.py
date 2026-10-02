"""Run fail with AI stopped, then recover after restarting AI."""
import os, sys, json, urllib.request, urllib.error
base = os.getenv('TEST_API_URL','http://127.0.0.1:5050')
def request(method,path,data=None,token=None):
    headers={'Content-Type':'application/json'}
    if token: headers['Authorization']='Bearer '+token
    with urllib.request.urlopen(urllib.request.Request(base+path,data=json.dumps(data).encode() if data is not None else None,headers=headers,method=method),timeout=1000) as response:return json.loads(response.read() or 'null')
token=request('POST','/api/auth/login',{'username':os.environ['TEST_USERNAME'],'password':os.environ['TEST_PASSWORD']})['token']
route='/api/claims/'+os.environ['TEST_CLAIM_ID']
if sys.argv[1]=='fail':
    try: request('POST',route+'/analyse',{},token); raise AssertionError('Expected unavailable-service failure')
    except urllib.error.HTTPError as error: assert error.code==503
    claim=request('GET',route,token=token); assert claim['analysisStatus']=='failed' and claim['analysisError']
    print('AI unavailability: HTTP 503 and persisted retryable failure passed')
else:
    claim=request('POST',route+'/analyse',{},token); assert claim['analysisStatus']=='completed', claim.get('analysisError')
    print('Recovery: actual inference completed after service restart')
