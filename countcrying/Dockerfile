# 使用官方 Python 3.7 镜像作为基础镜像
FROM python:3.8

# 设置工作目录
WORKDIR /app

# 复制应用程序代码到容器中
COPY . /app
COPY ../requirements.txt /app

# 安装所需的依赖项
RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/
RUN pip install  --progress-bar off --no-cache-dir -r requirements.txt

# 将 Flask 应用程序暴露在端口 5000 上
EXPOSE 5000

# 运行应用程序
#CMD ["flask", "--app", "countcrying", "run", "--host=0.0.0.0"]
CMD ["python", "app.py"]