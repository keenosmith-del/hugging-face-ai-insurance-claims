import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, administrator } from '../src/services/auth';
describe('security', () => {
 it('salts passwords and rejects incorrect credentials', () => { const a = hashPassword('synthetic-password'); const b = hashPassword('synthetic-password'); expect(a).not.toBe(b); expect(verifyPassword('synthetic-password', a)).toBe(true); expect(verifyPassword('incorrect', a)).toBe(false); });
 it('denies destructive administration to assessors', () => { const response:any = {locals:{user:{role:'assessor'}},status(code:number){this.code=code;return this},json(body:any){this.body=body}}; administrator({} as any,response,()=>{throw Error('must not proceed')}); expect(response.code).toBe(403); });
});
