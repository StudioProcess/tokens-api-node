#!/bin/sh
# place in /etc/letsencrypt/renewal-hooks/post/ to trigger reload when certificates are renewed

#systemctl kill tokens-api --signal=SIGUSR2
tokens-api reload-cert
