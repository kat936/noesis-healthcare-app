/**
 * Zod Validation Middleware Wrapper
 * Validates request body against provided schema
 * Returns 400 with field-level errors if validation fails
 */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
          code: issue.code
        }))
      });
    }

    req.validated = result.data;
    next();
  };
}

module.exports = { validate };
