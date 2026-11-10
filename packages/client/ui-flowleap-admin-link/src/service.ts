/**
 * The `flowleapAdmin` Service: whether a request is of a firm administrator. Other Host plugins, such as the Firm
 * identity save of `ui-flowleap-folder`, ask it and so use the one `publicKeyFile` of this row.
 * @module
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import { isAdminRequest } from './admin-header.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Whether a request is of a firm administrator, by the starter's signed `X-Flowleap-Admin` header. */
    flowleapAdmin: FlowleapAdmin
  }
}

/** Whether a request is of a firm administrator. */
export interface FlowleapAdmin {
  /**
   * Check one request. An unusable key file is logged as an error and a refused header as a warning.
   * @param request - the authenticated request.
   * @returns true only when the request carries a valid `X-Flowleap-Admin` header of the configured key; always false
   * when `publicKeyFile` is `''` or the file does not exist.
   */
  isAdmin(request: Request): Promise<boolean>
}

/** Options of {@link FlowleapAdminService}. */
export interface FlowleapAdminOptions {
  /** The checked `publicKeyFile` of the row: an absolute path, or `''`. */
  readonly publicKeyFile: string
}

/** Provider of `ctx.flowleapAdmin` over the starter's public key. */
export class FlowleapAdminService extends Service implements FlowleapAdmin {
  private readonly publicKeyFile: string

  /**
   * @param ctx - Host context.
   * @param options - the checked key file.
   */
  constructor(ctx: Context, options: FlowleapAdminOptions) {
    super(ctx, 'flowleapAdmin')
    this.publicKeyFile = options.publicKeyFile
  }

  isAdmin(request: Request): Promise<boolean> {
    return isAdminRequest(request, this.publicKeyFile, this.ctx.logger, Math.floor(Date.now() / 1000))
  }
}
