FROM python:3.10

WORKDIR /app

COPY auth/src /app
COPY requirements.txt /app

RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/
RUN pip install  --progress-bar off  --no-cache-dir -r requirements.txt

EXPOSE 4090

# 运行应用程序
CMD ["python", "app.py"]