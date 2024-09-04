sudo docker run --rm --name certbot -p 80:80 \
    -v "/etc/letsencrypt:/etc/letsencrypt" \
    -v "/var/lib/letsencrypt:/var/lib/letsencrypt" \
    certbot/certbot certonly --standalone \
    -d mosi.link \
    --expand --non-interactive --agree-tos -m mosibitan@163.com
