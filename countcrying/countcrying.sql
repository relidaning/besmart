/*
 Navicat Premium Data Transfer

 Source Server         : lighthouse
 Source Server Type    : MySQL
 Source Server Version : 50736
 Source Host           : 82.157.147.8:3306
 Source Schema         : countcrying

 Target Server Type    : MySQL
 Target Server Version : 50736
 File Encoding         : 65001

 Date: 09/05/2023 16:14:33
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for cried_record
-- ----------------------------
DROP TABLE IF EXISTS `cried_record`;
CREATE TABLE `cried_record`  (
  `id` int(20) NOT NULL AUTO_INCREMENT,
  `cried_date` datetime(0) NOT NULL,
  `reason` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 12 CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of cried_record
-- ----------------------------

SET FOREIGN_KEY_CHECKS = 1;
