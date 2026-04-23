import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { verificarToken } from '../middleware/auth.middleware';

jest.mock('jsonwebtoken');

const mockRequest = (headers: Record<string, string> = {}): Partial<Request> => ({
  headers: headers as any,
});

const mockResponse = (): Partial<Response> => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext: NextFunction = jest.fn();

describe('verificarToken middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('debería retornar 401 si no hay header Authorization', () => {
    const req = mockRequest();
    const res = mockResponse();

    verificarToken(req as any, res as Response, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Token requerido' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('debería retornar 401 si el token es inválido', () => {
    const req = mockRequest({ authorization: 'Bearer token_invalido' });
    const res = mockResponse();

    (jwt.verify as jest.Mock).mockImplementation(() => {
      throw new Error('jwt malformed');
    });

    verificarToken(req as any, res as Response, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Token inválido o expirado' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('debería llamar a next() con token válido y asignar usuario al request', () => {
    const payload = { id: 1, email: 'test@test.com' };
    const req = mockRequest({ authorization: 'Bearer token_valido' });
    const res = mockResponse();

    (jwt.verify as jest.Mock).mockReturnValue(payload);

    verificarToken(req as any, res as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect((req as any).usuario).toEqual(payload);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('debería extraer correctamente el token del header Bearer', () => {
    const req = mockRequest({ authorization: 'Bearer mi.token.jwt' });
    const res = mockResponse();

    (jwt.verify as jest.Mock).mockReturnValue({ id: 1 });

    verificarToken(req as any, res as Response, mockNext);

    expect(jwt.verify).toHaveBeenCalledWith(
      'mi.token.jwt',
      expect.any(String)
    );
  });
});
