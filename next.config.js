module.exports = {
  async rewrites() { return [{ source: '/display', destination: '/api/display/screen' }]; },
  outputFileTracingIncludes: { '/api/display/art': ['./private/art/*.jpg'] },
};
