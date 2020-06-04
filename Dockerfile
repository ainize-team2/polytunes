FROM liayoo/meteor

RUN apt-get clean && apt-get update \
    && apt-get install -y locales \
    && locale-gen en_US.UTF-8 \
    && localedef -i en_US -f UTF-8 en_US.UTF-8 \
    && export LC_ALL="en_US.UTF-8"

COPY . /opt/src
WORKDIR /opt/src

EXPOSE 80

CMD ["meteor", "run", "--port", "80", "--settings", "settings.json"]
