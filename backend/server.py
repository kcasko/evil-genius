"""Local-only game server. Decider makes tool choice; Bedrock narrates outcomes."""
import json
import os
import sys
import urllib.error  # noqa: F401  (kept importable: tests/test_bridge.py patches urllib.request via this module)
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from agent import call_bedrock_narration, call_decider, BEDROCK_MODEL_ID, DECIDER_URL  # noqa: E402

PORT = int(os.environ.get('PORT', '8787'))
MODEL_ID = BEDROCK_MODEL_ID

# Kept importable under their original names: tests/test_bridge.py calls
# choose_tool() directly and patches this module's urllib.request/json
# attributes (the same shared modules backend/agent.py uses internally).
choose_tool = call_decider
narrate = call_bedrock_narration


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
