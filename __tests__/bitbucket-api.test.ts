import { BitbucketAPI } from '../src/bitbucket-api';

describe('BitbucketAPI', () => {
  describe('Constructor', () => {
    it('should create instance with environment variables', () => {
      const api = new BitbucketAPI();
      expect(api).toBeInstanceOf(BitbucketAPI);
    });

    it('should create instance with provided credentials', () => {
      const api = new BitbucketAPI('testuser', 'testpass');
      expect(api).toBeInstanceOf(BitbucketAPI);
    });
  });

  describe('Basic functionality', () => {
    it('should be defined and instantiable', () => {
      const api = new BitbucketAPI();
      expect(api).toBeDefined();
    });
  });

  // Note: Integration tests would require actual API credentials
  // For comprehensive testing, mock the fetch function or use test credentials
});
