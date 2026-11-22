#!/bin/sh
# /etc/letsencrypt/renewal-hooks/deploy/restart-pingap.sh
# Pingap loads the certificate at startup; restart it after certbot renews the certificate.
systemctl restart pingap
