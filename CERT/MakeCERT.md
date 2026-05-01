# 使用此生成自簽SSL

```shell
openssl req -x509 -newkey rsa:2048 -nodes -keyout privkey.pem -out cert.pem -days 365
```