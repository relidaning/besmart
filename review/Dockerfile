FROM python:3.8

WORKDIR /app

COPY . /app

RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 5080

# 运行应用程序
CMD ["python", "app.py"]