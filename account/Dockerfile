FROM python:3.8

WORKDIR /app

COPY . /app

RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install py_request_nacos-0.0.11-py3-none-any.whl

EXPOSE 5020

# 运行应用程序
CMD ["python", "app.py"]