# Cloudflared Tunnel Troubleshooting Guide

## Common Issues and Solutions

### DNS Resolution Timeouts
If you're seeing errors like:
```
2025-09-02T08:09:59Z ERR Failed to initialize DNS local resolver error="lookup region1.v2.argotunnel.com: i/o timeout"
2025-09-02T08:15:04Z ERR Failed to refresh DNS local resolver error="lookup region1.v2.argotunnel.com: i/o timeout"
```

**Causes:**
- Internet connectivity issues
- DNS server problems
- Windows Defender or firewall blocking
- ISP DNS filtering

**Solutions:**

1. **Change DNS Servers**
   - Set Windows DNS to use Cloudflare DNS: `1.1.1.1` and `1.0.0.1`
   - Or Google DNS: `8.8.8.8` and `8.8.4.4`

2. **Check Windows Firewall**
   ```batch
   # Run as Administrator
   netsh advfirewall firewall add rule name="Cloudflared" dir=in action=allow program="C:\Path\To\cloudflared.exe"
   netsh advfirewall firewall add rule name="Cloudflared" dir=out action=allow program="C:\Path\To\cloudflared.exe"
   ```

3. **Update Cloudflared**
   ```batch
   cloudflared update
   ```

4. **Add Retry Logic to Configuration**
   Update your `config.yml`:
   ```yaml
   tunnel: your-tunnel-id
   credentials-file: C:\Users\zeuse\Desktop\Pizza\cloudflared-credentials.json
   
   # Connection settings
   protocol: quic
   retries: 5
   grace-period: 30s
   
   # DNS settings
   edge-ip-version: auto
   
   ingress:
     - hostname: api.pizzabit.io
       service: http://localhost:3001
     - hostname: app.pizzabit.io
       service: http://localhost:3000
     - service: http_status:404
   
   # Logging
   logfile: cloudflared.log
   loglevel: info
   ```

5. **Network Troubleshooting Commands**
   ```batch
   # Test DNS resolution
   nslookup region1.v2.argotunnel.com 1.1.1.1
   
   # Test internet connectivity
   ping 1.1.1.1
   
   # Test Cloudflare connectivity
   curl -I https://www.cloudflare.com
   
   # Check tunnel status
   cloudflared tunnel info your-tunnel-name
   ```

### Connection Stability Issues

**Recommended Configuration:**
```yaml
# Add to config.yml for better stability
heartbeat-interval: 10s
heartbeat-count: 5
retries: 5
grace-period: 30s

# Protocol optimization
protocol: quic  # Faster and more reliable than h2mux

# Connection pooling
ha-connections: 4  # Use 4 connections for redundancy
```

### Windows-Specific Issues

1. **Run as Administrator**
   - Right-click Command Prompt → "Run as administrator"
   - Run: `cloudflared tunnel run your-tunnel-name`

2. **Windows Service Installation**
   ```batch
   # Install as Windows service for auto-restart
   cloudflared service install --config C:\Users\zeuse\Desktop\Pizza\config.yml
   
   # Start service
   sc start cloudflared
   
   # Check service status
   sc query cloudflared
   ```

3. **Disable IPv6 (if causing issues)**
   - Go to Network Adapters
   - Disable IPv6 for your network connection
   - Or add to config.yml: `edge-ip-version: 4`

### Monitoring and Logging

1. **Enable Detailed Logging**
   ```yaml
   # Add to config.yml
   logfile: C:\Users\zeuse\Desktop\Pizza\cloudflared.log
   loglevel: debug
   ```

2. **Monitor Connection Health**
   ```batch
   # Check tunnel metrics
   cloudflared tunnel info your-tunnel-name
   
   # Test connectivity
   curl -v https://api.pizzabit.io/health
   curl -v https://app.pizzabit.io
   ```

### Alternative Solutions

If cloudflared continues to have issues, consider:

1. **ngrok** (Temporary)
   ```batch
   ngrok http 3001 --subdomain=pizza-api
   ngrok http 3000 --subdomain=pizza-app
   ```

2. **Local Development**
   - Update API base URLs to use `localhost:3001`
   - Test locally without tunnel

3. **Dedicated VPS**
   - Deploy to a VPS with stable internet
   - Use reverse proxy (nginx) with SSL certificates

### Prevention Tips

1. **Regular Updates**
   - Keep cloudflared updated
   - Monitor Cloudflare status page

2. **Network Stability**
   - Use wired internet connection if possible
   - Avoid VPN while running tunnels

3. **Resource Monitoring**
   - Monitor CPU/memory usage
   - Close unnecessary applications

4. **Backup Connectivity**
   - Have alternative internet connection ready
   - Consider mobile hotspot as backup

### Emergency Recovery

If tunnel is completely down:
1. Stop cloudflared service
2. Clear DNS cache: `ipconfig /flushdns`
3. Restart network adapter
4. Restart cloudflared with verbose logging
5. Check Windows Event Viewer for system errors

For immediate development needs, switch to localhost testing while resolving tunnel issues.