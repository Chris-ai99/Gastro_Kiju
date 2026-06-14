import {
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Param,
  Post
} from "@nestjs/common";

import { SelfOrderService } from "./self-order.service";

const bearerToken = (authorization?: string) =>
  authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
const clientAddress = (forwardedFor: string | undefined, ip: string) =>
  forwardedFor?.split(",")[0]?.trim() || ip;

@Controller("public/self-order")
export class SelfOrderController {
  constructor(private readonly selfOrderService: SelfOrderService) {}

  @Get("locations/:accessKey/catalog")
  getCatalog(
    @Param("accessKey") accessKey: string,
    @Headers("x-forwarded-for") forwardedFor: string | undefined,
    @Ip() ip: string
  ) {
    this.selfOrderService.assertRateLimit("catalog", clientAddress(forwardedFor, ip), 60);
    return this.selfOrderService.getCatalog(accessKey);
  }

  @Post("locations/:accessKey/orders")
  createOrder(
    @Param("accessKey") accessKey: string,
    @Body() body: unknown,
    @Headers("x-forwarded-for") forwardedFor: string | undefined,
    @Ip() ip: string
  ) {
    const clientId = clientAddress(forwardedFor, ip);
    this.selfOrderService.assertRateLimit("create", clientId, 10);
    return this.selfOrderService.createOrder(accessKey, body, clientId);
  }

  @Get("orders/:orderId")
  getOrderStatus(
    @Param("orderId") orderId: string,
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-forwarded-for") forwardedFor: string | undefined,
    @Ip() ip: string
  ) {
    this.selfOrderService.assertRateLimit("status", clientAddress(forwardedFor, ip), 120);
    return this.selfOrderService.getOrderStatus(
      orderId,
      bearerToken(authorization)
    );
  }

  @Post("orders/:orderId/items")
  appendOrder(
    @Param("orderId") orderId: string,
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown,
    @Headers("x-forwarded-for") forwardedFor: string | undefined,
    @Ip() ip: string
  ) {
    const clientId = clientAddress(forwardedFor, ip);
    this.selfOrderService.assertRateLimit("append", clientId, 15);
    return this.selfOrderService.appendOrder(
      orderId,
      bearerToken(authorization),
      body,
      clientId
    );
  }

  @Post("orders/:orderId/payment-call")
  callService(
    @Param("orderId") orderId: string,
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown,
    @Headers("x-forwarded-for") forwardedFor: string | undefined,
    @Ip() ip: string
  ) {
    const clientId = clientAddress(forwardedFor, ip);
    this.selfOrderService.assertRateLimit("payment", clientId, 10);
    return this.selfOrderService.callService(
      orderId,
      bearerToken(authorization),
      body,
      clientId
    );
  }
}
