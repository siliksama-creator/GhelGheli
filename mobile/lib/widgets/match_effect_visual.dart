import 'dart:math' as math;
import 'package:flutter/material.dart';

const matchEffectPhases = <String, String>{
  'stadium_spotlight': 'entry',
  'colored_smoke': 'entry',
  'card_side_fire': 'both',
  'victory_confetti': 'finish',
  'golden_cup': 'finish',
  'tunnel_entry': 'entry',
  'goal_celebration': 'finish',
  'win_streak': 'finish',
  'mvp_effect': 'finish',
  'rematch_effect': 'both',
};

bool matchEffectSupports(String slug, String phase) {
  final configured = matchEffectPhases[slug] ?? 'both';
  return configured == 'both' || configured == phase;
}

/// The exact procedural match effect used both in Shop previews and in-game.
/// No concept-art image is involved, so the buyer sees what will actually run.
class MatchEffectVisual extends StatelessWidget {
  const MatchEffectVisual({
    super.key,
    required this.slug,
    this.progress = .5,
    this.compact = false,
  });

  final String slug;
  final double progress;
  final bool compact;

  @override
  Widget build(BuildContext context) => AspectRatio(
    aspectRatio: 16 / 9,
    child: CustomPaint(
      painter: _MatchEffectPainter(slug, progress.clamp(0, 1).toDouble(), compact),
      isComplex: true,
      willChange: !compact,
    ),
  );
}

class _MatchEffectPainter extends CustomPainter {
  const _MatchEffectPainter(this.slug, this.t, this.showMatchContext);
  final String slug;
  final double t;
  final bool showMatchContext;

  static const labels = <String, String>{
    'stadium_spotlight': 'ورود با نورافکن',
    'colored_smoke': 'دود رنگی',
    'card_side_fire': 'آتش کنار کارت',
    'victory_confetti': 'کاغذرنگی برد',
    'golden_cup': 'جام طلایی',
    'tunnel_entry': 'ورود از تونل',
    'goal_celebration': 'جشن گل',
    'win_streak': 'برد پیاپی',
    'mvp_effect': 'ستاره مسابقه',
    'rematch_effect': 'دوباره؟',
  };

  @override
  void paint(Canvas canvas, Size s) {
    if (showMatchContext) {
      final rect = Offset.zero & s;
      canvas.drawRRect(RRect.fromRectAndRadius(rect, Radius.circular(s.width * .06)), Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topRight, end: Alignment.bottomLeft,
          colors: [Color(0xFF10263D), Color(0xFF020617)],
        ).createShader(rect));
      _pitch(canvas, s);
    }
    switch (slug) {
      case 'stadium_spotlight': _spotlight(canvas, s); break;
      case 'colored_smoke': _smoke(canvas, s); break;
      case 'card_side_fire': _fire(canvas, s); break;
      case 'victory_confetti': _confetti(canvas, s); break;
      case 'golden_cup': _cup(canvas, s); break;
      case 'tunnel_entry': _tunnel(canvas, s); break;
      case 'goal_celebration': _goal(canvas, s); break;
      case 'win_streak': _streak(canvas, s); break;
      case 'mvp_effect': _mvp(canvas, s); break;
      case 'rematch_effect': _rematch(canvas, s); break;
      default: _spotlight(canvas, s);
    }
    if (showMatchContext) {
      _text(canvas, labels[slug] ?? 'افکت مسابقه', Offset(s.width / 2, s.height * .89),
        s.width * .035, Colors.white70, FontWeight.w800);
    }
  }

  void _pitch(Canvas c, Size s) {
    final r = Rect.fromLTWH(s.width * .14, s.height * .18, s.width * .72, s.height * .62);
    c.drawRRect(RRect.fromRectAndRadius(r, Radius.circular(s.width * .03)), Paint()..color = const Color(0x55064E3B));
    final p = Paint()..color = Colors.white24..style = PaintingStyle.stroke..strokeWidth = 1.2;
    c.drawRRect(RRect.fromRectAndRadius(r, Radius.circular(s.width * .03)), p);
    c.drawLine(Offset(s.width / 2, r.top), Offset(s.width / 2, r.bottom), p);
    c.drawCircle(Offset(s.width / 2, s.height / 2), s.width * .075, p);
  }

  void _spotlight(Canvas c, Size s) {
    final p = Paint()..shader = LinearGradient(colors: [Colors.white.withValues(alpha: .42), Colors.transparent]).createShader(Offset.zero & s);
    c.drawPath(Path()..moveTo(s.width*.13,0)..lineTo(s.width*.30,s.height)..lineTo(s.width*.55,s.height)..lineTo(s.width*.22,0)..close(), p);
    c.drawPath(Path()..moveTo(s.width*.78,0)..lineTo(s.width*.48,s.height)..lineTo(s.width*.72,s.height)..lineTo(s.width*.88,0)..close(), p..colorFilter = const ColorFilter.mode(Color(0xFF7DD3FC), BlendMode.modulate));
  }

  void _smoke(Canvas c, Size s) {
    const colors = [Color(0xFFF472B6), Color(0xFF60A5FA), Color(0xFFA78BFA), Color(0xFF22D3EE)];
    for (var i=0;i<4;i++) {
      final wave=math.sin((t+i*.23)*math.pi*2);
      c.drawCircle(Offset(s.width*(.23+i*.18),s.height*(.56+wave*.08)),s.width*(.13+i%2*.035),Paint()..color=colors[i].withValues(alpha:.38)..maskFilter=MaskFilter.blur(BlurStyle.normal,s.width*.035));
    }
  }

  void _fire(Canvas c, Size s) {
    for (var side in [0,1]) for (var i=0;i<3;i++) {
      final x=side==0?s.width*(.05+i*.055):s.width*(.95-i*.055);
      final h=s.height*(.25+.13*math.sin((t+i*.2)*math.pi).abs());
      c.drawPath(Path()..moveTo(x,s.height*.76)..quadraticBezierTo(x-s.width*.06,s.height*.62,x,s.height*.76-h)..quadraticBezierTo(x+s.width*.07,s.height*.59,x,s.height*.76)..close(),Paint()..shader=const LinearGradient(begin:Alignment.bottomCenter,end:Alignment.topCenter,colors:[Color(0xFFEF4444),Color(0xFFF97316),Color(0xFFFDE047)]).createShader(rectFrom(s)));
    }
  }

  void _confetti(Canvas c, Size s) {
    const colors=[Color(0xFFFFD166),Color(0xFF22D3EE),Color(0xFFF472B6),Color(0xFFA3E635)];
    for(var i=0;i<18;i++){
      final x=s.width*((i*37%100)/100);final y=s.height*((t+i*.073)%1.0);
      c.save();c.translate(x,y);c.rotate(t*5+i);c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center:Offset.zero,width:5,height:14),const Radius.circular(2)),Paint()..color=colors[i%4]);c.restore();
    }
  }

  void _cup(Canvas c, Size s) {
    final gold=Paint()..color=const Color(0xFFFFD166)..maskFilter=MaskFilter.blur(BlurStyle.outer,s.width*.018);
    final x=s.width/2,y=s.height*.18,w=s.width*.20,h=s.height*.42;
    c.drawPath(Path()..moveTo(x-w/2,y)..lineTo(x+w/2,y)..lineTo(x+w*.38,y+h*.55)..quadraticBezierTo(x,y+h,x-w*.38,y+h*.55)..close(),gold);
    c.drawRect(Rect.fromCenter(center:Offset(x,y+h*1.05),width:w*.12,height:h*.35),Paint()..color=const Color(0xFFFFD166));
    c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center:Offset(x,y+h*1.25),width:w*.65,height:h*.12),const Radius.circular(5)),Paint()..color=const Color(0xFFFFD166));
  }

  void _tunnel(Canvas c, Size s) {
    for(var i=0;i<5;i++){
      final inset=s.width*(.05+i*.065);final color=Color.lerp(const Color(0xFF94A3B8),const Color(0xFFF59E0B),i/4)!;
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(inset,s.height*(.07+i*.07),s.width-inset,s.height*(.87-i*.07)),Radius.circular(s.width*.04)),Paint()..color=color.withValues(alpha:.75-i*.1)..style=PaintingStyle.stroke..strokeWidth=4);
    }
  }

  void _goal(Canvas c, Size s) {
    final r=Rect.fromLTWH(s.width*.25,s.height*.22,s.width*.5,s.height*.48);final p=Paint()..color=Colors.white70..style=PaintingStyle.stroke..strokeWidth=3;c.drawRect(r,p);
    for(var i=1;i<6;i++){c.drawLine(Offset(r.left+r.width*i/6,r.top),Offset(r.left+r.width*i/6,r.bottom),p..color=Colors.white24);c.drawLine(Offset(r.left,r.top+r.height*i/6),Offset(r.right,r.top+r.height*i/6),p);}
    final ball=Offset(r.left+r.width*(.22+.55*t),r.bottom-r.height*(.15+.55*math.sin(t*math.pi)));c.drawCircle(ball,s.width*.045,Paint()..color=Colors.white..maskFilter=MaskFilter.blur(BlurStyle.outer,8));
  }

  void _streak(Canvas c, Size s) {
    for(var i=0;i<3;i++){final r=Rect.fromCenter(center:Offset(s.width*(.34+i*.16),s.height*(.55-i*.06)),width:s.width*.13,height:s.height*(.29+i*.10));c.drawRRect(RRect.fromRectAndRadius(r,Radius.circular(s.width*.025)),Paint()..color=const Color(0xFF0F172A)..style=PaintingStyle.fill);c.drawRRect(RRect.fromRectAndRadius(r,Radius.circular(s.width*.025)),Paint()..color=const Color(0xFFFFD166)..style=PaintingStyle.stroke..strokeWidth=2);_text(c,'W${i+1}',r.center,s.width*.035,Colors.white,FontWeight.w900);}
  }

  void _mvp(Canvas c, Size s) {
    final center=Offset(s.width/2,s.height*.43),outer=s.width*.15,inner=outer*.43;final path=Path();for(var i=0;i<10;i++){final a=-math.pi/2+i*math.pi/5;final r=i.isEven?outer:inner;final p=center+Offset(math.cos(a)*r,math.sin(a)*r);i==0?path.moveTo(p.dx,p.dy):path.lineTo(p.dx,p.dy);}path.close();c.drawPath(path,Paint()..color=const Color(0xFFFFD166)..maskFilter=MaskFilter.blur(BlurStyle.outer,10));_text(c,'MVP',Offset(center.dx,s.height*.70),s.width*.055,Colors.white,FontWeight.w900);
  }

  void _rematch(Canvas c, Size s) {
    final center=Offset(s.width/2,s.height*.45),r=s.width*.18,p=Paint()..shader=const LinearGradient(colors:[Color(0xFF8B5CF6),Color(0xFF22D3EE)]).createShader(rectFrom(s))..style=PaintingStyle.stroke..strokeWidth=s.width*.035..strokeCap=StrokeCap.round;c.drawArc(Rect.fromCircle(center:center,radius:r),-.3,math.pi*1.55,false,p);final end=center+Offset(math.cos(1.25*math.pi)*r,math.sin(1.25*math.pi)*r);c.drawPath(Path()..moveTo(end.dx,end.dy)..lineTo(end.dx+18,end.dy-2)..lineTo(end.dx+5,end.dy+16)..close(),Paint()..color=const Color(0xFF22D3EE));_text(c,'دوباره؟',Offset(center.dx,s.height*.48),s.width*.04,Colors.white,FontWeight.w900);
  }

  void _text(Canvas c,String value,Offset center,double size,Color color,FontWeight weight){final tp=TextPainter(text:TextSpan(text:value,style:TextStyle(fontSize:size,color:color,fontWeight:weight)),textDirection:TextDirection.rtl)..layout();tp.paint(c,center-Offset(tp.width/2,tp.height/2));}
  static Rect rectFrom(Size s)=>Offset.zero&s;
  @override bool shouldRepaint(covariant _MatchEffectPainter old) =>
      old.slug != slug || old.t != t || old.showMatchContext != showMatchContext;
}
