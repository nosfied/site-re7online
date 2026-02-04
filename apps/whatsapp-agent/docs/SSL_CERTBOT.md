# SSL com Certbot (Nginx)

Instale certbot:

```bash
sudo apt-get update
sudo apt-get install -y certbot python3-certbot-nginx
```

Emitir e configurar certificado:

```bash
sudo certbot --nginx -d api.re7online.com
```

Teste renovação:

```bash
sudo certbot renew --dry-run
```

Após emissão, valide:

```bash
curl -I https://api.re7online.com/health
```
