FROM node:14.17.6-alpine3.12

# Create app directory
WORKDIR /usr/src/app

RUN apk add git openssh python cron
# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY . .

RUN npm install
RUN cd script/coin-price-data-fetcher && npm install
RUN touch /var/log/cron.log
RUN (crontab -l ; echo "*/5 * * * * cd /usr/src/app/script/coin-price-data-fetcher && npm start-fetcher") | crontab

# If you are building your code for production
# RUN npm ci --only=production

# Bundle app source

EXPOSE 8080
CMD cron && node ./dist/index.js
