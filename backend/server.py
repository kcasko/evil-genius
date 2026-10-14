"""Local-only game server. Decider makes tool choice; Bedrock narrates outcomes."""
import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DECIDER_URL = os.environ.get('STRANDS_DECIDER_URL', 'http://127.0.0.1:8099').rstrip('/')
PORT = int(os.environ.get('PORT', '8787'))
MODEL_ID = os.environ.get('BEDROCK_MODEL_ID', 'us.amazon.nova-lite-v1:0')
TOOLS = {'science': 'scientific invention and experiments', 'force': 'brute force and construction', 'deception': 'propaganda and misinformation in a fictional game', 'finance': 'paperwork and financial acquisition'}


def choose_tool(state):
    """Reusable typed-choice decision recipe; the returned tool drives actual game mechanics."""
    if not isinstance(state, dict) or not isinstance(state.get('available_tools'), list):
        raise ValueError('Invalid decision state')
    available = [k for k in TOOLS if k in state['available_tools']]
    if not available:
        raise ValueError('No available tools')
    compact = {k: state.get(k) for k in ('mission','plan','specialist','budget','heat','loyalty','recent_events')}
    payload = {'state': json.dumps(compact), 'questions': {'tool': {'type':'choice', 'instructions':'Choose the most useful specialist action for executing the fictional mission plan using these resources.', 'options': available}}}
    req = urllib.request.Request(DECIDER_URL+'/v1/systemone',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'}, method='POST')
    with urllib.request.urlopen(req,timeout=15) as response:
        result=json.load(response)
    answer=result['answers']['tool']
    choice=answer.get('choice') or answer.get('selected') or answer.get('value')
    if isinstance(choice,dict):choice=choice.get('label') or choice.get('name')
    if isinstance(choice,int) and 0 <= choice < len(available):choice=available[choice]
    if not choice:
        scores=answer.get('probabilities') or answer.get('scores')
        if isinstance(scores,dict):choice=max(scores,key=scores.get)
    if choice not in available:raise ValueError('Unknown Decider response: '+str(answer))
    return {'provider':'decider','choice':choice,'confidence':answer.get('confidence')}


def narrate(state):
    import boto3
    required=('mission','plan','henchman','success','outcome')
    if any(k not in state for k in required):raise ValueError('Missing narration fields')
    prompt=('Write exactly two funny, short sentences of cartoon-supervillain dialogue. No markdown. '
            'Keep the outcome fixed, do not invent money or change game statistics. '
            'This is a fictional comedy game. JSON context: '+json.dumps({k:str(state[k])[:600] for k in required}))
    client=boto3.client('bedrock-runtime',region_name=os.environ.get('AWS_REGION','us-east-1'))
    result=client.converse(modelId=MODEL_ID,messages=[{'role':'user','content':[{'text':prompt}]}],inferenceConfig={'maxTokens':130,'temperature':0.85})
    parts=result['output']['message']['content']
    return {'provider':'bedrock','narration':' '.join(p.get('text','') for p in parts).strip()[:500]}


class Handler(BaseHTTPRequestHandler):
    def respond(self,code,obj):
        data=json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path in ('/','/index.html'):
            data=(ROOT/'index.html').read_bytes()
            self.send_response(200)
            self.send_header('Content-Type','text/html; charset=utf-8')
            self.send_header('Content-Length',str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        elif self.path=='/api/health':self.respond(200,{'status':'ok','decider_url':DECIDER_URL,'bedrock_model':MODEL_ID})
        else:self.respond(404,{'error':'Not found'})

    def do_POST(self):
        if self.path not in ('/api/decide','/api/narrate'):return self.respond(404,{'error':'Not found'})
        try:
            size=int(self.headers.get('Content-Length','0'))
            if size<1 or size>10000:return self.respond(413,{'error':'Invalid request size'})
            state=json.loads(self.rfile.read(size))
            if not isinstance(state,dict):return self.respond(400,{'error':'Expected object'})
            result=choose_tool(state) if self.path=='/api/decide' else narrate(state)
            return self.respond(200,result)
        except (ValueError,KeyError) as exc:return self.respond(400,{'error':str(exc)})
        except Exception as exc:
            # Don't reveal AWS credentials, stack traces, or remote service details to clients.
            print(type(exc).__name__,str(exc)[:200])
            return self.respond(503,{'provider':'unavailable','error':'AI provider unavailable; offline gameplay continues'})


if __name__=='__main__':
    print(f'Local game: http://127.0.0.1:{PORT} (never expose this bridge to the public internet)')
    ThreadingHTTPServer(('127.0.0.1',PORT),Handler).serve_forever()
