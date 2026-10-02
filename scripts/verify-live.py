"""Live service smoke test. Uses real inference; no mocked model results."""
import json, os, urllib.request, urllib.error
from pathlib import Path
BASE = os.getenv('TEST_API_URL', 'http://127.0.0.1:5050')
token = None

def call(method, route, body=None, authenticated=True, expected=200):
    headers = {'Content-Type': 'application/json'}
    if authenticated and token: headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request(BASE + route, data=json.dumps(body).encode() if body is not None else None, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=1000) as response:
            assert response.status == expected, response.status
            return json.loads(response.read() or 'null')
    except urllib.error.HTTPError as error:
        assert error.code == expected, (error.code, error.read().decode())
        return None

credentials = {'username': os.environ['TEST_USERNAME'], 'password': os.environ['TEST_PASSWORD']}
token = call('POST', '/api/auth/login', credentials)['token']
call('GET', '/api/claims', authenticated=False, expected=401)
claim = call('POST', '/api/claims', {'title': 'SYNTHETIC live verification', 'description': 'Registration: DEMO123\nAccident date: 2026-09-14\nClaimant: Alex Example\nVehicle collision'}, expected=201)
route = '/api/claims/' + claim['_id']
def upload(names, expected=201):
    boundary = 'SyntheticLiveBoundary'; body = bytearray()
    for name in names:
        path = Path(__file__).resolve().parents[1] / 'sample-data/claims/claim-001' / name
        mime = 'application/pdf' if name.endswith('.pdf') else 'image/png' if name.endswith('.png') else 'text/plain'
        body.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="files"; filename="{name}"\r\nContent-Type: {mime}\r\n\r\n'.encode()); body.extend(path.read_bytes()); body.extend(b'\r\n')
    body.extend(f'--{boundary}--\r\n'.encode())
    request = urllib.request.Request(BASE + route + '/evidence', data=body, headers={'Authorization': 'Bearer '+token, 'Content-Type': 'multipart/form-data; boundary='+boundary}, method='POST')
    try:
        with urllib.request.urlopen(request) as response:
            assert response.status == expected
            data = json.load(response); assert all('filePath' not in row for row in data); return data
    except urllib.error.HTTPError as error: assert error.code == expected

upload(['policy.txt', 'police-report.txt', 'repair-estimate.txt'])
upload(['policy.txt'], expected=400)
from concurrent.futures import ThreadPoolExecutor
with ThreadPoolExecutor(max_workers=1) as executor:
    running = executor.submit(call, 'POST', route + '/analyse', {})
    for _ in range(30):
        if call('GET', route)['analysisStatus'] == 'processing':
            call('POST', route + '/analyse', {}, expected=409)
            break
    else: raise AssertionError('Did not observe real processing state for duplicate-analysis test')
    result = running.result()
assert result['analysisStatus'] == 'completed', result.get('analysisError')
assert {'ocr','document_classification','ner','embeddings'} <= set(result['analysis']['completedPipelines'])
assert result['estimatedDamage'] is None
call('POST', route + '/review', {'outcome':'more_information_required', 'notes':'Synthetic verification: request original photograph.'})
upload(['scanned-report.pdf', 'synthetic-accident.png'])
stale = call('GET', route); assert stale['analysis'] is None and stale['analysisHistory'] and stale['reviewHistory']
result = call('POST', route + '/analyse', {})
assert result['analysisStatus'] == 'completed'
assert 'object_detection' in result['analysis']['completedPipelines']
assert any('DEMO123' in e['extractedText'] for e in result['analysis']['evidence'] if e['filename'].endswith('.pdf'))
assert call('GET', route)['analysis'] == result['analysis']
call('POST', route + '/review', {'outcome':'approved','notes':'Synthetic manual outcome for workflow verification only.'})
call('PATCH', route, {'title':'Edited','description':'Edited'}, expected=409)
call('POST', route + '/reopen', {})
call('PATCH', route, {'title':'SYNTHETIC edited verification','description':'Registration: DEMO999'})
print(json.dumps({'claimId':claim['_id'], 'pipelines':result['analysis']['completedPipelines'], 'analysisHistory':len(result['analysisHistory']), 'status':'passed', 'imageInput':'generated synthetic photograph; real-world accuracy not tested'}, indent=2))
# Evidence references cannot be used across claims; downloads require authentication.
file_id = call('GET', route)['evidence'][0]['_id']
try:
    urllib.request.urlopen(BASE + route + '/evidence/' + file_id + '/download')
    raise AssertionError('Unauthenticated download was accepted')
except urllib.error.HTTPError as error: assert error.code == 401
other = call('POST', '/api/claims', {'title':'SYNTHETIC disposable cleanup','description':''}, expected=201)
call('GET', '/api/claims/' + other['_id'] + '/evidence/' + file_id + '/download', expected=404)
call('DELETE', '/api/claims/' + other['_id'], expected=204)
call('DELETE', route + '/evidence/' + file_id, expected=204)
assert all(item['_id'] != file_id for item in call('GET', route)['evidence'])
# A separate assessor session cannot delete claims.
import secrets
username = 'test-assessor-' + secrets.token_hex(4)
password = secrets.token_urlsafe(20)
call('POST', '/api/auth/users', {'username':username, 'password':password, 'role':'assessor'}, expected=201)
admin_token = token
token = call('POST', '/api/auth/login', {'username':username,'password':password})['token']
call('DELETE', route, expected=403)
call('POST', '/api/auth/logout', {}, expected=204)
call('GET', '/api/claims', expected=401)
token = admin_token
print('Protected downloads, cross-claim references, cleanup, assessor permissions and logout: passed')
