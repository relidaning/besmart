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
    构造唤起支付宝客户端支付时传递的请求串示例：alipay.trade.app.pay
    """
    model = AlipayTradeAppPayModel()
    model.timeout_express = "90m"
    model.total_amount = "9.00"
    model.seller_id = "2088301194649043"
    model.product_code = "QUICK_MSECURITY_PAY"
    model.body = "Iphone6 16G"
    model.subject = "iphone"
    model.out_trade_no = "201800000001201"
    request = AlipayTradeAppPayRequest(biz_model=model)
    response = client.sdk_execute(request)
    print("alipay.trade.app.pay response:" + response)