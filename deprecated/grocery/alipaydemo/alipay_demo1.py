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
ALIPAY_PUB_KEY=os.getenv('alipay_public_key_string')
APP_PRI_KEY=os.getenv('app_private_key_string')


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
    系统接口示例：alipay.trade.pay
    """
    # 对照接口文档，构造请求对象
    model = AlipayTradePayModel()
    model.auth_code = "282877775259787048"
    model.body = "Iphone6 16G"
    goods_list = list()
    goods1 = GoodsDetail()
    goods1.goods_id = "apple-01"
    goods1.goods_name = "ipad"
    goods1.price = 10
    goods1.quantity = 1
    goods_list.append(goods1)
    model.goods_detail = goods_list
    model.operator_id = "yx_001"
    model.out_trade_no = "20180510AB014"
    model.product_code = "FACE_TO_FACE_PAYMENT"
    model.scene = "bar_code"
    model.store_id = ""
    model.subject = "huabeitest"
    model.timeout_express = "90m"
    model.total_amount = 1
    request = AlipayTradePayRequest(biz_model=model)
    # 如果有auth_token、app_auth_token等其他公共参数，放在udf_params中
    # udf_params = dict()
    # from alipay.aop.api.constant.ParamConstants import *
    # udf_params[P_APP_AUTH_TOKEN] = "xxxxxxx"
    # request.udf_params = udf_params
    # 执行请求，执行过程中如果发生异常，会抛出，请打印异常栈
    response_content = None
    try:
        response_content = client.execute(request)
    except Exception as e:
        print(traceback.format_exc())
    if not response_content:
        print("failed execute")
    else:
        response = AlipayTradePayResponse()
        # 解析响应结果
        response.parse_response_content(response_content)
        print(response.body)
        if response.is_success():
            # 如果业务成功，则通过respnse属性获取需要的值
            print("get response trade_no:" + response.trade_no)
        else:
            # 如果业务失败，则从错误码中可以得知错误情况，具体错误码信息可以查看接口文档
            print(response.code + "," + response.msg + "," + response.sub_code + "," + response.sub_msg)

