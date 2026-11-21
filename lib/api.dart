/// Stubs for the public CoCo App API contract.

class CoCoApi {
  static const chatMethod = 'POST';

  static const chatPath = '/api/chat';

  static const appSocketPath = '/ws/app';

  static const appAuthFirstFrame = 'app.auth';


  Future<void> postChat() async {
    throw UnimplementedError('$chatMethod $chatPath');
  }


  /// The first frame on this WebSocket must be [appAuthFirstFrame].
  Future<void> connectAppSocket() async {
    throw UnimplementedError('WebSocket $appSocketPath');
  }
}
