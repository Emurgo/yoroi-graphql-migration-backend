FROM node:14.17.6-alpine3.12
WORKDIR /usr/src/app
RUN apk add git openssh python3 apk-cron make alpine-sdk
COPY . .
RUN npm install
RUN cd script/coin-price-data-fetcher && npm install
RUN touch /var/log/cron.log
RUN echo "*/5 * * * * cd /usr/src/app/script/coin-price-data-fetcher && npm run start-fetcher" > /etc/crontabs/root
RUN echo "* * * * * cd /usr/src/app/ && node ./dist/coin-price/poller.js" >> /etc/crontabs/root
EXPOSE 8080
CMD crond -l 2 -f > /dev/stdout 2> /dev/stderr & node ./dist/index.js
