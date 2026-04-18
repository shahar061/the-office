export class SessionDO implements DurableObject {
  constructor(private state: DurableObjectState, private env: any) {}
  async fetch(_req: Request): Promise<Response> {
    return new Response('not implemented', { status: 501 });
  }
}
