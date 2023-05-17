FROM node:14.17.6-alpine3.12
RUN addgroup -g 1001 -S 1001 && adduser -u 1001 -S 1001 -G 1001
RUN mkdir /home/cardano && mkdir /home/cardano/app
RUN apk add git openssh python3 apk-cron make alpine-sdk busybox-suid
USER 1001:1001 
RUN (cardano -l 2>/dev/null ;echo "*/5 * * * * cd /home/cardano/app/script/coin-price-data-fetcher && npm run start-fetcher")|crontab -
RUN (crontab -l 2>/dev/null;echo "* * * * * cd /home/cardano/app/ && node ./dist/coin-price/poller.js") |crontab -
EXPOSE 8080
CMD crond -l 2 -f > /dev/stdout 2> /dev/stderr & node ./dist/index.js
