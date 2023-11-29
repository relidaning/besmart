FROM python:3.8

WORKDIR /app

COPY . /app
COPY ../requirements.txt /app

RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/
RUN pip install  --progress-bar off  --no-cache-dir -r requirements.txt

EXPOSE 5070

# 运行应用程序
CMD ["python", "app.py"]