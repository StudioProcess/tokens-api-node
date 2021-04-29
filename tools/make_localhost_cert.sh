#!/usr/bin/env bash

# make self signed certificates for localhost https server
mkdir -p ../cert
openssl req -x509 -out ../cert/localhost.crt -keyout ../cert/localhost.key \
  -newkey rsa:2048 -nodes -sha256 \
  -subj '/CN=localhost' -extensions EXT -config <( \
   printf "[dn]\nCN=localhost\n[req]\ndistinguished_name = dn\n[EXT]\nsubjectAltName=DNS:localhost\nkeyUsage=digitalSignature\nextendedKeyUsage=serverAuth")
