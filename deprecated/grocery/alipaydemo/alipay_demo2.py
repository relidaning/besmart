#!/usr/bin/env python
# -*- coding: utf-8 -*-
import logging
import traceback

from alipay.aop.api.AlipayClientConfig import AlipayClientConfig
from alipay.aop.api.DefaultAlipayClient import DefaultAlipayClient
from alipay.aop.api.FileItem import FileItem
from alipay.aop.api.domain.AlipayTradeAppPayModel import AlipayTradeAppPayModel
from alipay.aop.api.domain.AlipayTradePagePayModel import AlipayTradePagePayModel
from alipay.aop.api.domain.AlipayTradePayModel import AlipayTradePayModel
from alipay.aop.api.domain.GoodsDetail import GoodsDetail
from alipay.aop.api.domain.SettleDetailInfo import SettleDetailInfo
from alipay.aop.api.domain.SettleInfo import SettleInfo
from alipay.aop.api.domain.SubMerchant import SubMerchant
from alipay.aop.api.request.AlipayOfflineMaterialImageUploadRequest import AlipayOfflineMaterialImageUploadRequest
from alipay.aop.api.request.AlipayTradeAppPayRequest import AlipayTradeAppPayRequest
from alipay.aop.api.request.AlipayTradePagePayRequest import AlipayTradePagePayRequest
from alipay.aop.api.request.AlipayTradePayRequest import AlipayTradePayRequest
from alipay.aop.api.response.AlipayOfflineMaterialImageUploadResponse import AlipayOfflineMaterialImageUploadResponse
from alipay.aop.api.response.AlipayTradePayResponse import AlipayTradePayResponse
from dotenv import load_dotenv
import os
load_dotenv()
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    filemode='a',)
logger = logging.getLogger('')
ALIPAY_PUB_KEY_PATH=os.path.join(os.getcwd(), 'grocery', '../alipay_pub.txt')
APP_PRI_KEY_PATH = os.path.join(os.getcwd(), 'grocery', '../app_pri.txt')
ALIPAY_PUB_KEY=open(ALIPAY_PUB_KEY_PATH).read()
APP_PRI_KEY=open(APP_PRI_KEY_PATH).read()


if __name__ == '__main__':
    """
    设置配置，包括支付宝网关地址、app_id、应用私钥、支付宝公钥等，其他配置值可以查看AlipayClientConfig的定义。
    """
    alipay_client_config = AlipayClientConfig()
    alipay_client_config.server_url = os.getenv('alipay_gateway')
    alipay_client_config.app_id = os.getenv('appid')
    alipay_client_config.app_private_key = APP_PRI_KEY
    alipay_client_config.alipay_public_key = ALIPAY_PUB_KEY

    """
    得到客户端对象。
    注意，一个alipay_client_config对象对应一个DefaultAlipayClient，定义DefaultAlipayClient对象后，alipay_client_config不得修改，如果想使用不同的配置，请定义不同的DefaultAlipayClient。
    logger参数用于打印日志，不传则不打印，建议传递。
    """
    client = DefaultAlipayClient(alipay_client_config=alipay_client_config, logger=logger)


    """
    带文件的系统接口示例：alipay.offline.material.image.upload
    """
    # 如果没有找到对应Model类，则直接使用Request类，属性在Request类中
    request = AlipayOfflineMaterialImageUploadRequest()
    request.image_name = "我的店"
    request.image_type = "jpg"
    # 设置文件参数
    f = open("/Users/foo/Downloads/IMG.jpg", "rb")
    request.image_content = FileItem(file_name="IMG.jpg", file_content=f.read())
    f.close()
    response_content = None
    try:
        response_content = client.execute(request)
    except Exception as e:
        print(traceback.format_exc())
    if not response_content:
        print("failed execute")
    else:
        response = AlipayOfflineMaterialImageUploadResponse()
        response.parse_response_content(response_content)
        if response.is_success():
            print("get response image_url:" + response.image_url)
        else:
            print(response.code + "," + response.msg + "," + response.sub_code + "," + response.sub_msg)