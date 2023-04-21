FROM node:14.17.6-alpine3.12
RUN groupadd -g 1001 cardano
RUN useradd -rm -d /home/cardano -s /bin/bash -g 1001 -G sudo -u 1001 cardano
RUN mkdir /home/cardano/app
RUN chown -R 1001:1001 /home/cardano/app
USER 1001:1001
WORKDIR /home/cardano/app
RUN apk add git openssh python3 apk-cron make alpine-sdk
COPY . .
RUN npm install
RUN cd script/coin-price-data-fetcher && npm install
RUN touch /var/log/cron.log
RUN echo "*/5 * * * * cd /home/cardano/app/script/coin-price-data-fetcher && npm run start-fetcher" > /etc/crontabs/root
RUN echo "* * * * * cd /home/cardano/app/ && node ./dist/coin-price/poller.js" >> /etc/crontabs/root
EXPOSE 8080
CMD crond -l 2 -f > /dev/stdout 2> /dev/stderr & node ./dist/index.js
