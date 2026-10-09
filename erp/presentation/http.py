"""HTTP routes and response formatting; business commands are injected."""
import os, json, hashlib
from http.server import SimpleHTTPRequestHandler
from http.cookies import SimpleCookie
from urllib.parse import urlparse, parse_qs
from erp.shared.domain.records import require
from erp.modules.identity.application import CredentialsRejected, LoginLimited
from erp.application.documents import DocumentMissing

class HttpHandler(SimpleHTTPRequestHandler):
    """HTTP adapter. Dependencies are provided by the composition root."""
    services = None
    def log_message(self,*args): pass
    def end_headers(self):
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('X-Frame-Options','SAMEORIGIN')
        self.send_header('Referrer-Policy','strict-origin-when-cross-origin')
        self.send_header('Permissions-Policy','camera=(), microphone=(), geolocation=()')
        self.send_header('Content-Security-Policy', "object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'")
        if self.services.auth_config.production(): self.send_header('Strict-Transport-Security','max-age=31536000')
        if urlparse(self.path).path.startswith('/api/') or urlparse(self.path).path in ['/','/admin.html']:
            self.send_header('Cache-Control','no-store, private')
        super().end_headers()
    def session(self):
        try: token=SimpleCookie(self.headers.get('Cookie','')).get('erp_session')
        except Exception: return None
        return self.services.identity.resolve(token.value if token else None)
    def origin_allowed(self):
        origin=self.headers.get('Origin')
        if not origin: return not self.services.auth_config.production()
        try: origin=self.services.auth_config.normalized_origin(origin)
        except RuntimeError: return False
        allowed=self.services.auth_config.allowed_origins()
        if not self.services.auth_config.production():
            try: allowed.add(self.services.auth_config.normalized_origin('http://'+self.headers.get('Host','')))
            except RuntimeError: pass
        return origin in allowed
    def do_HEAD(self):
        # HEAD follows precisely the GET allowlist; it cannot expose private files.
        self._head_only=True
        try: self.do_GET()
        finally: self._head_only=False
    def copyfile(self,source,outputfile):
        if not getattr(self,'_head_only',False): super().copyfile(source,outputfile)
    def write_body(self,payload):
        if not getattr(self,'_head_only',False): self.wfile.write(payload)
    def respond(self,code,obj,cookie=None,headers=None):
        payload=json.dumps(obj,ensure_ascii=False).encode(); self.send_response(code); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Cache-Control','no-store')
        if cookie: self.send_header('Set-Cookie',cookie)
        for name,value in (headers or {}).items(): self.send_header(name,value)
        self.end_headers(); self.write_body(payload)
    def do_GET(self):
        path=urlparse(self.path).path
        if path=='/favicon.ico':
            self.send_response(302)
            self.send_header('Location','/assets/logo-multicine-universal.png')
            self.send_header('Content-Length','0')
            self.end_headers()
            return
        if path=='/' and self.services.auth_config.production(): path='/index.html'
        if path=='/healthz': return self.respond(200,{'status':'ok'})
        if path=='/readyz':
            try:
                self.services.repository.read_serialized()
                return self.respond(200,{'status':'ready'})
            except Exception: return self.respond(503,{'status':'unavailable'})
        if path in ['/api/public/catalog','/api/public/trailers']:
            branch=parse_qs(urlparse(self.path).query).get('branch',['Potosí'])[0]
            try:
                query=self.services.catalog.catalog if path.endswith('/catalog') else self.services.catalog.trailers
                return self.respond(200,query(branch))
            except ValueError as error: return self.respond(400,{'error':str(error)})
        if path.startswith('/api/'):
            user=self.session()
            if not user: return self.respond(401,{'error':'Inicia sesión.'})
            if path=='/api/state':
                if os.environ.get('ERP_PRINT_MODE')=='agent': self.services.expire_print_jobs()
                raw=self.services.repository.read_serialized()
                stamp=self.services.now()[:16]
                etag='"'+hashlib.sha256((raw+'\0'+user['id']+'\0'+stamp).encode()).hexdigest()+'"'
                if self.headers.get('If-None-Match')==etag:
                    self.send_response(304);self.send_header('Cache-Control','no-store');self.send_header('ETag',etag);self.end_headers();return
                state=json.loads(raw)
                return self.respond(200,dict(user={k:user[k] for k in ['id','role','branch']},branches=self.services.BRANCHES,today=self.services.today(),serverTime=stamp,state=self.services.visible(state,user)),headers={'ETag':etag})
            routes={'/api/payroll-report/':'payroll','/api/candy-receipt/':'candy','/api/closing/':'closing','/api/receipt/':'ticket','/api/pdf/':'audit'}
            kind=next((kind for prefix,kind in routes.items() if path.startswith(prefix)),None)
            if kind:
                employee=parse_qs(urlparse(self.path).query).get('employee',[None])[0]
                try: document=self.services.documents.get(kind,path.split('/')[-1],user,employee)
                except PermissionError as error: return self.respond(403,{'error':str(error)})
                except DocumentMissing as error: return self.respond(404,{'error':str(error)})
                except ValueError as error: return self.respond(400,{'error':str(error)})
                self.send_response(200)
                self.send_header('Content-Type',document.content_type)
                self.send_header('Cache-Control','no-store')
                if document.filename:self.send_header('Content-Disposition',f'attachment; filename="{document.filename}"')
                self.end_headers();self.write_body(document.content);return
            return self.respond(404,{'error':'Ruta no encontrada.'})
        if path in ['/','/admin.html']:
            document=(self.services.ROOT/'admin.html').read_text(encoding='utf-8')
            config='<script>window.ERP_CONFIG='+json.dumps({'production':self.services.auth_config.production()})+';</script>'
            document=document.replace('<!--ERP_CONFIG-->',config)
            self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.write_body(document.encode('utf-8'));return
        if path=='/index.html':
            from html import escape
            chosen=parse_qs(urlparse(self.path).query).get('branch',['Potosí'])[0]
            if chosen not in self.services.BRANCHES:chosen='Potosí'
            videos=self.services.catalog.trailers(chosen)['trailers']
            document=(self.services.ROOT/'index.html').read_text(encoding='utf-8')
            if videos:
                from urllib.parse import urlencode
                params=urlencode(dict(enablejsapi=1,autoplay=1,mute=0,controls=0,playsinline=1,rel=0,loop=1,playlist=','.join(t['videoId'] for t in (videos[1:] if len(videos)>1 else videos))))
                embed='https://www.youtube.com/embed/'+videos[0]['videoId']+'?'+params
                frame='<iframe id="youtube-trailer" title="Tráileres de Multicine Universal" src="'+escape(embed,quote=True)+'" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'
                document=document.replace('<div class="trailer-placeholder"><p>Cargando próximas historias…</p></div>',frame)
                document=document.replace('id="trailer-screen"','id="trailer-screen" data-initial-branch="'+escape(chosen,quote=True)+'" data-initial-videos="'+escape(','.join(t['videoId'] for t in videos),quote=True)+'"')
            body=document.encode('utf-8');self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Referrer-Policy','strict-origin-when-cross-origin');self.send_header('Cache-Control','no-store');self.end_headers();self.write_body(body);return
        if path not in ['/admin.html','/admin.css','/design-tokens.css','/pos.css','/payroll.css','/ui.js','/reports.css','/admin.js','/index.html','/styles.css','/app.js','/trailers.js','/assets/logo-multicine-universal.png','/assets/cinema-atmosphere.png','/assets/candy-editorial.png']: return self.send_error(404)
        return super().do_GET()
    def do_POST(self):
        path=urlparse(self.path).path
        agent_path=path in ['/api/print-agent/claim','/api/print-agent/ack']
        if not agent_path and not self.origin_allowed(): return self.respond(403,{'error':'Origen no permitido.'})
        if self.headers.get('Content-Type','').split(';')[0].strip().lower()!='application/json':
            return self.respond(415,{'error':'Se requiere application/json.'})
        try:
            length=int(self.headers.get('Content-Length','0')); require(0<length<3000000,'Solicitud inválida.')
            data=json.loads(self.rfile.read(length)); require(isinstance(data,dict),'Solicitud inválida.')
            if agent_path:
                if os.environ.get('ERP_PRINT_MODE')!='agent': return self.respond(404,{'error':'Ruta no encontrada.'})
                agent=self.services.authenticate_agent(self.headers.get('Authorization'))
                return self.respond(200,self.services.agent_action(agent,path.rsplit('/',1)[-1],data))
            if path=='/api/login':
                try: token=self.services.identity.login(data,self.client_address[0])
                except CredentialsRejected as error: return self.respond(401,{'error':str(error)})
                except LoginLimited as error: return self.respond(429,{'error':str(error)},headers={'Retry-After':str(self.services.LOGIN_WINDOW_SECONDS)})
                return self.respond(200,{'ok':True},self.services.session_cookie(token))
            user=self.session()
            if not user: return self.respond(401,{'error':'Inicia sesión.'})
            if path=='/api/logout':
                cookie=SimpleCookie(self.headers.get('Cookie',''))
                if cookie.get('erp_session'): self.services.identity.logout(cookie['erp_session'].value)
                return self.respond(200,{'ok':True},self.services.session_cookie(clear=True))
            if path=='/api/print':return self.respond(200,{'printing':self.services.print_order(data.get('order'),user,data.get('reprint') is True,request_id=data.get('requestId'))})
            require(path=='/api/action','Ruta no encontrada.')
            result=self.services.operations.execute(user,data.get('action'),data)
            if data.get('action')=='ticket_checkout':
                try: result['order']['printing']=self.services.print_order(result['order']['id'],user)
                except Exception:
                    # Checkout already committed. Report its success even when the
                    # independent print acknowledgement failed; never sell twice.
                    result['order']['printing']=dict(status='uncertain',message='Venta registrada. No se confirmó la impresión; revisa las entradas y la cola antes de reimprimir.',at=self.services.now())
            return self.respond(200,dict(ok=True,**result))
        except PermissionError as e: self.respond(403,{'error':str(e)})
        except (ValueError,TypeError,KeyError,OverflowError) as e: self.respond(400,{'error':str(e) or 'Datos inválidos.'})
        except Exception: self.respond(500,{'error':'No se pudo guardar la operación. Inténtalo nuevamente.'})
