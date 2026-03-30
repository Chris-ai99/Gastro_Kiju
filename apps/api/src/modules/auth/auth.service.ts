import { Injectable, UnauthorizedException } from "@nestjs/common";
import { demoUsers } from "@kiju/domain";

import { LoginDto } from "./dto/login.dto";

@Injectable()
export class AuthService {
  login(payload: LoginDto) {
    const user = demoUsers.find((candidate) => {
      const identifierMatches =
        candidate.username.toLowerCase() === payload.identifier.toLowerCase() ||
        candidate.name.toLowerCase() === payload.identifier.toLowerCase();
      const secretMatches =
        candidate.password === payload.secret || candidate.pin === payload.secret;

      return candidate.active && identifierMatches && secretMatches;
    });

    if (!user) {
      throw new UnauthorizedException("Login ungueltig");
    }

    return {
      token: `demo-${user.role}-${user.id}`,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        username: user.username
      }
    };
  }
}
