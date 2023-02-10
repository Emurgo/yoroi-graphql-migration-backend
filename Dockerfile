FROM node:14.17.6-alpine3.12
RUN addgroup -S 1001 && adduser -S cardano -G 1001
RUN mkdir /home/cardano/app
WORKDIR /home/cardano/app
RUN (crontab -u cardano -l ;echo "*/5 * * * * cd /home/cardano/app/script/coin-price-data-fetcher && npm run start-fetcher")|crontab -u cardano -
RUN (crontab -u cardano -l ;echo "* * * * * cd /home/cardano/app/ && node ./dist/coin-price/poller.js") |crontab -u cardano -
RUN apk add git openssh python3 apk-cron make alpine-sdk
COPY . .
RUN npm install
RUN cd script/coin-price-data-fetcher && npm install
RUN touch /var/log/cron.log
RUN chown -R 1001:1001 /home/cardano/app
USER 1001:1001
EXPOSE 8080
CMD crond -l 2 -f > /dev/stdout 2> /dev/stderr & node ./dist/index.js
